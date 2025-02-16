exports.version = 4
exports.description = "Ban IPs after too many requests in a short time. No persistence on restart."
exports.apiRequired = 9.5 // newSocket
exports.repo = "rejetto/antidos"

exports.config = {
    max: { type: 'number', min: 0, defaultValue: 500, xs: 6, label: "Max requests" },
    seconds: { type: 'number', min: 1, defaultValue: 5, xs: 6, label: "Time window", unit: "seconds", helperText: "Limit in time" },
    howLong: { type: 'number', min: 0, defaultValue: 0, required: true, xs: 6, unit: "seconds", label: "Ban for", helperText: "0 = infinite" },
    whitelist: { multiline: true, helperText: "one ip per line; masks are supported" },
    errors: { label: "Consider only errors", placeholder: "no, consider all requests", helperText: "you can specify HTTP error codes separated by | (pipe), and only those will be counted, or use * for all", },
}
exports.configDialog = {
    sx: { maxWidth: '20em' },
}

exports.init = api => {
    const { isLocalHost, makeNetMatcher } = api.require('./misc')

    const reqsByIp = new Map()
    const ban = new Set()
    let isWhiteListed
    api.subscribeConfig('whitelist', v => // keep it updated
        isWhiteListed = makeNetMatcher((v||'').split('\n').map(x => `(${x.trim()})`).join('|')) )

    const timer = setInterval(() => {
        const now = Date.now() - api.getConfig('seconds') * 1000
        for (const [ip,reqs] of reqsByIp.entries()) {
            let n = 0
            while (reqs[n] < now)
                n++
            if (!n) continue
            reqs.splice(0, n)
            if (!reqs.length)
                reqsByIp.delete(ip)
        }
    }, 1000)

    // early disconnection
    const cancelEvent = api.events.on('newSocket', ({ ip }) => {
        if (isBanned(ip))
            return api.events.preventDefault
    })

    return {
        unload() {
            cancelEvent()
            clearInterval(timer)
        },
        middleware: ctx => () => {
            const {ip} = ctx
            const res = isBanned(ip)
            if (res === false) return
            const errors = api.getConfig('errors')?.trim()
            if (errors === '*' && ctx.status < 400
            || errors && !api.misc.matches(String(ctx.status), errors)) return
            if (res === undefined) { // consider banning
                let a = reqsByIp.get(ip)
                if (!a)
                    reqsByIp.set(ip, a = [])
                a.push(Date.now())
                if (a.length <= api.getConfig('max')) return
                api.log("banning " + ip)
                ban.add(ip)
                reqsByIp.delete(ip)
                const ms = api.getConfig('howLong') * 1000
                if (ms) setTimeout(() => {
                    ban.delete(ip)
                    api.log("ban lifted " + ip)
                }, ms)
            }
            ctx.socket.destroy()
            return ctx.stop()
        }
    }

    function isBanned(ip) {
        if (isLocalHost(ip) || isWhiteListed(ip)) return false
        if (ban.has(ip))
            return true
    }
}