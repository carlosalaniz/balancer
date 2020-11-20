

var last_value = 0;
var probe_every = 30;
var min_delta = 0;
var autoBalancerUrl = "https://balancer.admint.io/balance";

function log(message) {
    var logNode = document.getElementById("logs");
    var logs = logNode.childNodes;
    if (logs.length >= 300) {
        logNode.removeChild(logs[0]);
    }
    var node = document.createElement("div");
    node.style.padding = ".5em 0 "
    node.style.borderBottom = "1px darkgray solid"
    node.innerHTML = `<small>${new Date().toLocaleString()}</small> | \t${JSON.stringify(message, undefined, 2)}`;
    logNode.appendChild(node);
}

// Example POST method implementation:
async function postData(url = '', data = {}) {
    // Default options are marked with *
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, *cors, same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        headers: {
            'Content-Type': 'application/json'
            // 'Content-Type': 'application/x-www-form-urlencoded',
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    });
    return response.json(); // parses JSON response into native JavaScript objects
}

function contains(document, selector, text) {
    var elements = document.querySelectorAll(selector);
    return [].filter.call(elements, function (element) {
        return RegExp(text).test(element.textContent);
    });
}

// Create Iframe
var loaded = 0;
function loadFrame() {
    log("Page checked:", loaded++, " times");
    document.getElementById("frame_container").innerHTML = `
        <iframe
        id="iframe"
        src="https://pools.balancer.exchange/#/pool/0xe2eb726bce7790e57d978c6a2649186c4d481658/" 
        style="width: 0%; height: 0%; border: 0px;"></iframe>
    `;
}

function handleValue(value) {
    if (last_value != value) {
        log("Change of value detected...", last_value, " to ", value);
        last_value = value;
        value = value.replace(',', '');
        if (!isNaN(value)) {
            log("Attempting to balance to ", value);
            postData(autoBalancerUrl, { balancer: value, min_delta: min_delta })
                .then(data => {
                    log("Call successful..."); // JSON data parsed by `data.json()` call
                });
        } else {
            log(value, "not a number");
        }
    } else {
        log("No change of value detected...", last_value)
    }
}

var interval = null
function startInterval() {
    probe_every = document.getElementById("interval").value;
    autoBalancerUrl = document.getElementById("balance_url").value
    min_delta = document.getElementById("min_delta").value

    log("interval started...")
    loadFrame();
    interval = setInterval(() => {
        var iframeDocument = document.getElementById("iframe").contentWindow.document;
        var BALValueRowResult = contains(iframeDocument, "a", "BAL");
        if (BALValueRowResult.length > 0) {
            var value = BALValueRowResult[0].parentNode.parentNode.querySelectorAll("span")[3].getAttribute("title")
            // Do something with the value
            handleValue(value);
            //Reload iframe;
            loadFrame();
        }
    }, probe_every * 1000);
}

function stopInterval() {
    log("interval stopped...")
    clearInterval(interval);
}


document.querySelector("html").innerHTML = `
    <label>Balance URL <input value="https://balancer.admint.io/balance" id="balance_url" style="width:100%" type="text"></label>
    </br>
    </br>
    <label>Interval (Seconds) <input value="30" id="interval" style="width:100%" type="number"></label>
    <label>Min delta<input value="0" id="min_delta" style="width:100%" type="number"></label>
    </br>
    </br>
    <hr>
    <button onclick="startInterval()">Start</button>
    <button onclick="stopInterval()">Stop</button>
    <hr>
    <div id="logs" style="border:1px black solid; padding: 1em;"></div>
    <div id="frame_container"></div>
`;

console.clear();