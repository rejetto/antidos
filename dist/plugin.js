exports.version = 1
exports.description = "Ban IPs after too many requests in a short time. Counting is reset on restart."
exports.apiRequired = 4
exports.repo = "rejetto/antidos"

exports.config = {
    max: { type: 'number', min: 0, defaultValue: 200, helperText: "Max number of requests" },
    seconds: { type: 'number', min: 1, defaultValue: 10, helperText: "Time window for request counting" },
}

exports.init = api => {

    const reqsByIp = new Map()
    const ban = new Set()

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
            if (ban.has(ip))
                return ctx.socket.end()
            let a = reqsByIp.get(ip)
            if (!a)
                reqsByIp.set(ip, a = [])
            a.push(Date.now())
            if (a.length > api.getConfig('max')) {
                api.log("banning " + ip)
                ban.add(ip)
                reqsByIp.delete(ip)
            }
        }
    }
}