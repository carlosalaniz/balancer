const crypto = require('crypto');
class FTXExchange {
    static stable = {}
    constructor(FTX_KEY, FTX_SECRET) {
        this.exchangeName = "FTX";
        this.FTX_KEY = FTX_KEY;
        this.FTX_SECRET = FTX_SECRET;
        this.axios = require('axios').create({
            baseURL: 'https://ftx.com',
            headers: {
                'FTX-KEY': this.FTX_KEY,
                'X-Requested-With': 'XMLHttpRequest',
                'content-type': 'application/json'
            }
        });
    }
    getSignature(time, method, api_enpoint, body) {
        var hmac = crypto.createHmac('sha256', this.FTX_SECRET);
        let payload = "";
        if (method === "GET") {
            payload = `${time}${method}${api_enpoint}`;
        } else if (method === 'POST') {
            payload = `${time}${method}${api_enpoint}${body}`;
        }
        hmac.update(payload);
        const signature = hmac.digest("hex");
        return signature;
    }
    async get(path) {
        let time = + new Date();
        return await this.axios.get(path, {
            headers: {
                'FTX-TS': time.toString(),
                'FTX-SIGN': this.getSignature(time, "GET", path)
            }
        });
    }
    async getRateAsync(mi, mo) {
        let marketin = FTXExchange.stable[mi] || mi;
        let marketout = FTXExchange.stable[mo] || mo;
        // example: BTC/USD
        let spot = `${marketin}/${marketout}`
        let path = `/api/markets/${spot}`
        try {
            let response = await this.get(path);
            return response.data.result.price;
        } catch (e) {
            if (e && e.response.status === 404) {
                return {
                    path: path,
                    error: e.response.data.error
                }
            }
            throw e;
        }
    }

    async getPosition(future) {
        let path = "/api/positions";
        let response = await this.get(path);
        let futurePosition = response.data.result.filter(p => p.future === future);
        if (futurePosition.length === 1) {
            return futurePosition[0];
        } else {
            throw response;
        }
    }
    getName = () => this.exchangeName

}

class BinanceExchange {
    static stable = {
        "USD": "USDT"
    }
    constructor(KEY, SECRET) {
        this.exchangeName = "BINANCE"
        this.KEY = KEY;
        this.SECRET = SECRET;
        this.axios = require('axios').create({
            baseURL: 'https://api.binance.com',
            headers: {
                'X-MBX-APIKEY': this.KEY,
                'X-Requested-With': 'XMLHttpRequest',
                'content-type': 'application/json'
            }
        });
    }
    getSignature(time, method, queryString, body) {
        const crypto = require('crypto');
        var hmac = crypto.createHmac('sha256', this.SECRET);
        let payload = "";
        if (method === "GET") {
            payload = `${queryString}&timestamp=${time}`;
        }
        //todo: POST
        hmac.update(payload);
        const signature = hmac.digest("hex");
        return signature;
    }
    async get(path) {
        let time = + new Date();
        let queryString = path.split("?")[1];
        let signature = this.getSignature(time, "GET", queryString);
        return await this.axios.get(`${path}&signature=${signature}`);
    }
    async getRateAsync(mi, mo) {
        let marketin = BinanceExchange.stable[mi] || mi;
        let marketout = BinanceExchange.stable[mo] || mo;
        let symbol = `${marketin}${marketout}`;
        let path = `/sapi/v1/margin/priceIndex?symbol=${symbol}`;
        try {
            let rates = await this.get(path);
            return rates.data.price;
        } catch (e) {
            if (e && e.response.status >= 400 && e.response.status < 500) {
                return {
                    path: path,
                    error: e.response.data
                }
            }
            throw e;
        }

    }

    getName = () => this.exchangeName
}

class CoinbaseExchange {
    static stable = {
    }

    constructor() {
        this.exchangeName = "COINBASE"
        this.axios = require('axios').create({
            baseURL: 'https://api.coinbase.com/v2',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'content-type': 'application/json'
            }
        });
    }

    async get(path) {
        return await this.axios.get(path);
    }

    async getRateAsync(mi, mo) {
        let marketin = CoinbaseExchange.stable[mi] || mi;
        let marketout = CoinbaseExchange.stable[mo] || mo;
        let path = `/exchange-rates?currency=${marketin}`;
        try {
            let rates = await this.get(path);
            let rate = rates.data.data.rates[marketout];
            if (!rate) {
                return `${marketin}/${marketout} Not available`
            }
            return rate;
        } catch (e) {
            if (e && e.response.status >= 400 && e.response.status < 500) {
                return {
                    path: path,
                    error: e.response.data
                }
            }
            throw e;
        }

    }

    getName = () => this.exchangeName
}


module.exports = {
    BinanceExchange, FTXExchange, CoinbaseExchange
}