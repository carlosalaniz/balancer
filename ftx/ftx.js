class ftx {
    constructor(FTX_KEY, FTX_SECRET, SUBACCOUNT_NAME) {
        this.FTX_KEY = FTX_KEY;
        this.FTX_SECRET = FTX_SECRET;

        let headers = {
            'FTX-KEY': this.FTX_KEY,
            'X-Requested-With': 'XMLHttpRequest',
            'content-type': 'application/json'
        }

        if(SUBACCOUNT_NAME){
            headers['FTX-SUBACCOUNT'] =  encodeURI(SUBACCOUNT_NAME);
        }

        this.axios = require('axios').create({
            baseURL: 'https://ftx.com',
            headers: headers
        });
    }
    getName = () => "ftx";

    getSignature(time, method, api_enpoint, body) {
        const crypto = require('crypto');
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

    async getPosition(future) {
        let path = "/api/positions";
        let time = + new Date();
        let response = await this.axios.get(path, {
            headers: {
                'FTX-TS': time.toString(),
                'FTX-SIGN': this.getSignature(time, "GET", path)
            }
        });
        let futurePosition = response.data.result.filter(p => p.future === future);
        if (futurePosition.length === 1) {
            return futurePosition[0];
        } else {
            throw response;
        }
    }

    async placeOrder(amount, side, future) {
        let path = "/api/orders";
        let payload = {
            "market": future,
            "side": side,
            "price": null,
            "type": "market",
            "size": amount,
            // "reduceOnly": false,
            // "ioc": false,
            // "postOnly": false,
            // "clientId": null
        }
        let time = + new Date();
        let response = await this.axios.post(path, payload, {
            headers: {
                'FTX-TS': time.toString(),
                'FTX-SIGN': this.getSignature(time, "POST", path, JSON.stringify(payload))
            }
        });
        console.log("payload", payload)
        console.log("response", response.data);
    }

    async goLongBy(amount, future) {
        let result = await this.placeOrder(amount, "buy", future);
        return result;
    }

    async goShortBy(amount, future) {
        let result = await this.placeOrder(amount, "sell", future);
        return result;
    }

}

module.exports = {
    ftx
}