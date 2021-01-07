class binance {
    constructor(KEY, SECRET) {
        const axios = require('axios');
        this.SECRET = SECRET;
        this.APIKEY = KEY;
        this.fapi = axios.create({
            baseURL: 'https://fapi.binance.com',
            headers: {
                'X-MBX-APIKEY': this.APIKEY,
                'X-Requested-With': 'XMLHttpRequest',
                'content-type': 'application/json'
            }
        });
    }
    getName = () => "binance";
    getSignature(queryString) {
        const crypto = require('crypto');
        var hmac = crypto.createHmac('sha256', this.SECRET);
        //todo: POST
        hmac.update(queryString);
        const signature = hmac.digest("hex");
        return signature;
    }

    async call(path, GETPOST) {
        let time = + new Date();
        let split = path.split("?");
        path = split[0];
        let queryString = split[1];
        if (!queryString) {
            queryString = `timestamp=${time}`
        } else {
            queryString += `&timestamp=${time}`
        }
        let signature = this.getSignature(queryString);
        let uri = `${path}?${queryString}&signature=${signature}`;
        if (GETPOST === "GET") {
            return await this.fapi.get(uri);
        } else {
            return await this.fapi.post(uri);
        }
    }
    get = async (path) => await this.call(path, "GET");
    post = async (path) => await this.call(path, "POST");

    // As defined in https://binance-docs.github.io/apidocs/futures/en/#position-information-v2-user_data
    async getPosition(future) {
        let path = `/fapi/v2/positionRisk?symbol=${future}`;
        try {
            let accountInfo = await this.get(path);
            let position = accountInfo.data[0];
            return { size: Math.abs(position.positionAmt) };
        } catch (e) {
            if (e && e.response.status >= 400 && e.response.status < 500) {
                return {
                    path: path,
                    error: e.response.data
                }
            }
            // throw e;
        }
    }

    async placeOrder(amount, buy, future) {
        let path = `/fapi/v1/order?symbol=${future}&side=${buy ? 'BUY' : 'SELL'}&type=MARKET&quantity=${amount}`;
        try {
            let response = await this.post(path);
            return response;
        } catch (e) {
            if (e && e.response.status >= 400 && e.response.status < 500) {
                return {
                    path: path,
                    error: e.response.data
                }
            }
            //throw e;
        }
    }

    async buy(amount, future) {
        return await this.placeOrder(amount.toFixed(1), true, future);
    }

    async sell(amount, future) {
        return await this.placeOrder(amount.toFixed(1), false, future);
    }

    goLongBy = async (amount, future) => await this.buy(amount, future); Carlos
    goShortBy = async (amount, future) => await this.sell(amount, future);
}

module.exports = { binance };

// (async () => {
//     let b = new binance(
//         "GpJ21vajWRiJpDGMbe6SwDGrae2EjvrlHFEwS30DbgdX3TqE4fri6EP0FzQUUoQ6",
//         "hxffXvHOWWQbdUX8GfrBOGXr9BKu8yc4P3MyM1AQ0Km9xHlb2N3KFFzmvrqGcUXM"
//     );
//     let a1 = await b.getPosition("BALUSDT");
//     let b1 = await b.goShortBy(.1, "BALUSDT");
//     let a2 = await b.getPosition("BALUSDT");
//     let b2 = await b.goLongBy(.2, "BALUSDT");
//     let a3 = await b.getPosition("BALUSDT");
//     let b3 = await b.goShortBy(.1, "BALUSDT");
//     let a4 = await b.getPosition("BALUSDT");
//     console.log("finished");
// })();