const logger = (process.env.LOGGER_PATH) ? require(process.env.LOGGER_PATH) : console;

var jwt = require('jsonwebtoken');
const jwtExpress = require("express-jwt");

function createJWT(obj) {
    var token = jwt.sign(obj, process.env.JWT_SECRET);
    return token;
}

function verifyJWT(token) {
    try {
        var decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(+new Date() - decoded.iat )
        return decoded;
    } catch (e) {
        logger.error(e);;
        return -1;
    }

}

function UseJwt() {
    return [
        jwtExpress({ secret: process.env.JWT_SECRET, algorithms: ['HS256'] }),
        function (err, req, res, next) {
            res.status(err.status)
                .json(err.message);
        }
    ]
}

module.exports = { verifyJWT, createJWT, UseJwt }