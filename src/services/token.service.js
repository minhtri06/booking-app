const createError = require("http-errors")
const jwt = require("jsonwebtoken")
const moment = require("moment")

const { Token } = require("../models")
const { ACCESS, REFRESH, RESET_PASSWORD, VERIFY_EMAIL } =
    require("../constants").tokenTypes
const {
    jwt: {
        SECRET,
        ACCESS_EXPIRATION_MINUTES,
        REFRESH_EXPIRATION_DAYS,
        RESET_PASSWORD_EXPIRATION_MINUTES,
        VERIFY_EMAIL_EXPIRATION_MINUTES,
    },
} = require("../configs/envConfig")

/**
 * Generate a token
 * @param {string} userId
 * @param {moment.Moment} expires
 * @param {string} type
 * @returns {string}
 */
const generateToken = (userId, expires, type) => {
    const payload = {
        sub: userId,
        iat: moment().unix(),
        exp: expires.unix(),
        type,
    }
    return jwt.sign(payload, SECRET)
}

/**
 * Generate a new access token
 * @param {string} userId
 * @returns {string}
 */
const generateAccessToken = (userId) => {
    const expires = moment().add(ACCESS_EXPIRATION_MINUTES, "minutes")
    return `Bearer ${generateToken(userId, expires, ACCESS)}`
}

/**
 * Create a refresh token for a user
 * @param {string} userId
 * @returns {Promise<token>}
 */
const createRefreshToken = async (userId) => {
    const expires = moment().add(REFRESH_EXPIRATION_DAYS, "days")
    const token = generateToken(userId, expires, REFRESH)
    return await Token.create({
        body: token,
        user: userId,
        type: REFRESH,
        expires: expires.toDate(),
        isRevoked: false,
        isUsed: false,
        isBlacklisted: false,
    })
}

/**
 * Create reset password token for a user
 * @param {string} userId
 * @returns {Promise<token>}
 */
const createResetPasswordToken = async (userId) => {
    const expires = moment().add(RESET_PASSWORD_EXPIRATION_MINUTES, "minutes")
    const token = generateToken(userId, expires, RESET_PASSWORD)
    return Token.create({
        body: token,
        user: userId,
        type: RESET_PASSWORD,
        expires: expires.toDate(),
    })
}

/**
 * Create verify verify token for a user
 * @param {string} userId
 * @returns {Promise<token>}
 */
const createVerifyEmailToken = async (userId) => {
    const expires = moment().add(VERIFY_EMAIL_EXPIRATION_MINUTES, "minutes")
    const token = generateToken(userId, expires, VERIFY_EMAIL)
    return Token.create({
        body: token,
        user: userId,
        type: VERIFY_EMAIL,
        expires: expires.toDate(),
    })
}

/**
 * Create auth tokens
 * @param {string} userId
 * @returns {Promise<{ accessToken, refreshToken }>}
 */
const createAuthTokens = async (userId) => {
    const accessToken = generateAccessToken(userId)
    const refreshToken = await createRefreshToken(userId, accessToken)
    return {
        accessToken,
        refreshToken: refreshToken.body,
    }
}

/**
 * Get token info
 * @param {string} token
 * @returns {{sub, iat, exp, type, isExpired}}
 */
const getTokenInfo = (token) => {
    const info = jwt.decode(token, SECRET)
    if (info) {
        info.isExpired = info.exp < moment().unix()
    }
    return info
}

/**
 * Verify a token and return token's info
 * @param {string} token
 * @param {string} type
 * @returns {{ sub, iat, exp, type, isExpired }}
 */
const verifyToken = (token, type) => {
    const info = getTokenInfo(token)
    if (!info || info.type !== type) {
        throw createError.BadRequest(`Invalid ${type} token`)
    }
    if (info.isExpired) {
        throw createError.BadRequest(`${type} token has expired`)
    }
    return info
}

/**
 * Blacklist all usable tokens of a user
 * @param {string} userId
 */
const blackListAUser = async (userId) => {
    await Token.updateMany(
        { user: userId, type: REFRESH, isUsed: false, isRevoked: false },
        { isBlacklisted: true },
    )
}

/**
 * Get one token
 * @param {{
 *   body,
 *   user,
 *   type,
 *   expires,
 *   isRevoked,
 *   isUsed,
 *   isBlacklisted,
 * }} filter
 * @returns {Promise<token>}
 */
const getOneToken = async (filter) => {
    const token = await Token.findOne(filter)
    if (!token) {
        throw createError.NotFound("Token not found")
    }
    return token
}

/**
 * Delete many tokens
 * @param {{
 *   body,
 *   user,
 *   type,
 *   expires,
 *   isRevoked,
 *   isUsed,
 *   isBlacklisted,
 * }} filter
 */
const deleteManyTokens = async (filter) => {
    return Token.deleteMany(filter)
}

module.exports = {
    generateToken,
    generateAccessToken,
    createRefreshToken,
    createResetPasswordToken,
    createVerifyEmailToken,
    createAuthTokens,
    getTokenInfo,
    verifyToken,
    blackListAUser,
    getOneToken,
    deleteManyTokens,
}

/**
 * @typedef {InstanceType<Token>} token
 */
