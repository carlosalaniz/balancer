var last_value = 0;
var probe_every = 30;

function contains(document, selector, text) {
    var elements = document.querySelectorAll(selector);
    return [].filter.call(elements, function (element) {
        return RegExp(text).test(element.textContent);
    });
}

// Create Iframe
function loadFrame() {
    document.getElementById("frame_container").innerHTML = `
        <iframe
        id="iframe" " 
        src="https://pools.balancer.exchange/#/pool/0xe2eb726bce7790e57d978c6a2649186c4d481658/" 
        style="width: 0%; height: 0%; border: 0px;"></iframe>
    `;
}

function handleValue(value) {
    if(last_value != value){
        console.info("val:" + value);
        last_value = value;
    }
}

var interval = null
function startInterval() {
    loadFrame();
    interval = setInterval(() => {
        // console.warn("Checking");
        var iframeDocument = document.getElementById("iframe").contentWindow.document;
        var BALValueRowResult = contains(iframeDocument, "a", "BAL");
        // console.warn(BALValueRowResult, BALValueRowResult.length);
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
    clearInterval(interval);
}


document.querySelector("html").innerHTML = `        
    <button onclick="startInterval()">Start</button>
    <button onclick="stopInterval()">Stop</button>
    <div id="frame_container"></div>
`;
