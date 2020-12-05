module.exports = function (time) {
    return new Promise((resolutionFunc, rejectionFunc) => {
        setTimeout(() => {
            resolutionFunc();
        }, time * 1000)
    })
}