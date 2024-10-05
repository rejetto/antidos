exports.version = 2.31
exports.description = "Ban IPs after too many requests in a short time. No persistence on restart."
exports.apiRequired = 8.85
exports.repo = "rejetto/antidos"

exports.config = {
    max: { type: 'number', min: 0, defaultValue: 500, helperText: "Max number of requests" },
    seconds: { type: 'number', min: 1, defaultValue: 5, xs: 6, label: "Time window", unit: "seconds", helperText: "Limit in time" },
    howLong: { type: 'number', min: 0, defaultValue: 0, xs: 6, unit: "seconds", helperText: "0 = infinite" },
    whitelist: { type: 'string', multiline: true, helperText: "one ip per line; masks are supported" }
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

    return {
        unload() {
            clearInterval(timer)
        },
        async middleware(ctx) {
            const { ip } = ctx
            if (isWhiteListed(ip)) return
            if (ban.has(ip)) {
                ctx.socket.end()
                return true
            }
            if (isLocalHost(ctx)) return
            let a = reqsByIp.get(ip)
            if (!a)
                reqsByIp.set(ip, a = [])
            a.push(Date.now())
            if (a.length <= api.getConfig('max')) return
            api.log("banning " + ip)
            ban.add(ip)
            reqsByIp.delete(ip)
            const long = api.getConfig('howLong') * 1000
            if (!long) return
            setTimeout(() => {
                ban.delete(ip)
                api.log("ban lifted " + ip)
            }, long)
        }
    }
}