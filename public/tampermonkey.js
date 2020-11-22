// ==UserScript==
// @name         Trader
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://pools.balancer.exchange/
// @run-at      document-start
// ==/UserScript==

(function () {
    'use strict';

    /**
     * In seconds
     */
    const WAIT_AFTER_GETTING_VALUE = 20;
    const TIMEOUT = 25;
    const AUTO_BALANCER_ENDPOINT = "https://balancer.admint.io/balance";
    const MIN_DELTA = 0;
    var StartTrying = null;
    // get application values 
    var values_collected = null;

    async function initValues() {
        if (window.localStorage.values_collected) {
            values_collected = +window.localStorage.values_collected + 1;
        } else {
            values_collected = 1;
        }
        window.localStorage.values_collected = values_collected;
        document.getElementById("values_collected").innerText = values_collected;
    }

    function contains(document, selector, text) {
        var elements = document.querySelectorAll(selector);
        return [].filter.call(elements, function (element) {
            return RegExp(text).test(element.textContent);
        });
    }

    function tryFindBalanceToValue(callback) {
        if (StartTrying === null) {
            StartTrying = +new Date();
        }
        if ((+new Date() - StartTrying) > (TIMEOUT * 1000)) {
            document.getElementById("refreshing").style.display = "block";
            document.getElementById("refreshing").innerText = "TIMED OUT RELOADING NOW";
            setTimeout(() => {
                location.reload();
            }, 1500);
            return false;
        }
        var BALValueRowResult = contains(document, "a", "BAL");
        if (BALValueRowResult.length > 0) {
            var value = BALValueRowResult[0].parentNode.parentNode.querySelectorAll("span")[3].getAttribute("title")
            value = value.replace(',', '');
            document.getElementById("current_value").innerText = value;
            if (!isNaN(value)) {
                callback(value)
                return true;
            }
        }
        return false;
    }

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

    function handleValue(value) {
        postData(AUTO_BALANCER_ENDPOINT, { balancer: value, min_delta: MIN_DELTA })
            .then(data => {
                console.info("Trade successful..."); // JSON data parsed by `data.json()` call
                console.info(data); // JSON data parsed by `data.json()` call
                document.getElementById("latest_response").innerText = JSON.stringify(data, null, 2);
            });
    }

    function noShow() {
        // Hide all elements
        [].forEach.call(document.getElementsByTagName("html")[0].children, (el) => {
            el.style.display = "none"

        });

        // Remove CSS stylesheets
        [].forEach.call(document.querySelectorAll('link[rel=stylesheet]'), function (element) {
            try {
                element.parentNode.removeChild(element);
            } catch (err) { }
        });
    }

    function renderInfo() {
        var newContentNode = document.createElement("div");
        /**
         * values_collected
         * current_value
         * current_time
         * latest_response
         * 
         */
        newContentNode.innerHTML = `
        <div id="calamardo"><div style="text-align: center;"><div><h1>Auto balancer</h1> <img style=" max-width: 80%; background-image: url('https://www.memeatlas.com/images/pepes/pepe-gets-excited.gif'); background-size: 80px; background-color:whitesmoke; border-radius: 100%; " src="https://i.kym-cdn.com/photos/images/original/000/671/564/804.gif"></div></div><div style="width:80%; margin: 2em auto; border:1px solid black;"></div><div style="text-align: center;"><div style="margin: 1em 0"> <b>Values collected:</b> <span id="values_collected"></span> | <b>Current Value:</b> <span id="current_value">-</span></div><div> Latest response <br><pre style="display: inline-block;text-align: left; background-color: whitesmoke;" id="latest_response"></pre><h2 id="refreshing" style="display:none">Refreshing in <span id="seconds"></span> seconds...</h2></div></div></div>
        `;
        let htmlEl = document.getElementsByTagName("html")[0];
        htmlEl.appendChild(newContentNode)
        var calamardo = document.getElementById("calamardo");
        calamardo.scrollIntoView();
        htmlEl.scrollIntoView();
        calamardo.scrollIntoView();
    }

    var counter = WAIT_AFTER_GETTING_VALUE;
    function showCounter() {
        document.getElementById("refreshing").style.display = "block";
        document.getElementById("seconds").innerText = counter;
        let i = setInterval(() => {
            if (counter > 0) {
                document.getElementById("seconds").innerText = --counter;
            } else {
                clearInterval(i);
            }
        }, 1000);
    }



    noShow();
    renderInfo();
    initValues();
    if (!tryFindBalanceToValue(handleValue)) {
        var interval = setInterval(() => {
            if (tryFindBalanceToValue(handleValue)) {
                // Stop waiting
                clearInterval(interval)
                showCounter()
                // Reload in X amount of secconds
                setTimeout(() => {
                    location.reload();
                }, WAIT_AFTER_GETTING_VALUE * 1000)
            }
        }, 1000)
    };


})();