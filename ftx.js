const axios = require('axios').create({
    baseURL: 'https://ftx.com',
    headers: {
        'FTX-KEY': process.env.FTX_KEY,
        'X-Requested-With': 'XMLHttpRequest',
        'content-type': 'application/json'
    }
});

function getSignature(time, method, api_enpoint, body) {
    const crypto = require('crypto');
    var hmac = crypto.createHmac('sha256', process.env.FTX_SECRET);
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

async function getPosition(future) {
    let path = "/api/positions";
    let time = + new Date();
    let response = await axios.get(path, {
        headers: {
            'FTX-TS': time.toString(),
            'FTX-SIGN': getSignature(time, "GET", path)
        }
    });
    let futurePosition = response.data.result.filter(p => p.future === future);
    if (futurePosition.length === 1) {
        return futurePosition[0];
    } else {
        throw response;
    }
}

async function placeOrder(amount, side, future) {
    let path = "/api/orders";
    let time = + new Date();
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
    let response = await axios.post(path, payload, {
        headers: {
            'FTX-TS': time.toString(),
            'FTX-SIGN': getSignature(time, "POST", path, JSON.stringify(payload))
        }
    });
    console.log(response.data);
}



async function goLongBy(amount, future) {
    //buy
    let result = await placeOrder(amount, "buy", future);
    return result;
}
async function goShortBy(amount, future) {
    let result = await placeOrder(amount, "sell", future);
    return result;
}
module.exports = {
    getPosition, goShortBy, goLongBy
}