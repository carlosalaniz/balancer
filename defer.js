/**
 * Create an new deferred promise that can be resolved/rejected from outside.
 * @return {Promise} A new Promise with two extra methods: resolve and reject.
 *
 * @example
 * const unknownResult = () => {
 *   const deferredPromise = defer()
 *
 *   const errorTimeoutId = setTimeout(
 *     () => {
 *       clearTimeout(successTimeoutId)
 *       deferredPromise.reject(new Error('Error!'))
 *     },
 *     Math.round(Math.random() * 1e4)
 *   )
 *
 *   const successTimeoutId = setTimeout(
 *     () => {
 *       clearTimeout(errorTimeoutId)
 *       deferredPromise.resolve('Success!')
 *     },
 *     Math.round(Math.random() * 1e4)
 *   )
 *
 *   return deferredPromise
 * }
 *
 * unknownResult()
 *   .then(console.log)
 *   .catch(console.error)
 */
const defer = () => {
  const bag = {}
  return Object.assign(
    new Promise((resolve, reject) => Object.assign(bag, { resolve, reject })),
    bag
  )
}

module.exports = { defer }

