export async function postData(url = '', data = {}, raw, headers) {
    // Default options are marked with *
    let request = {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, *cors, same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        credentials: 'same-origin', // include, *same-origin, omit
        headers: {
            'Content-Type': 'application/json'
            // 'Content-Type': 'application/x-www-form-urlencoded',
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    };
    if (Array.isArray(headers)) {
        headers.forEach(h => request.headers[h[0]] = h[1]);
    }
    const response = await fetch(url, request);
    if (raw) {
        return response;
    }
    return response.json(); // parses JSON response into native JavaScript objects
}

export async function postWithToken(url, body) {
    return await postData(url, body, true, [
        ['Authorization', `Bearer ${window.localStorage.access_token}`]
    ]);
}


export function users() {
    if (!window.localStorage.jwt) {
        window.location.href = "/login";
    }
}

export function guest() {
    if (window.localStorage.jwt) {
        window.location.href = "/transactions";
    }
}