/**
 * Debounce function that delays the execution of a given function until after
 * a specified amount of time has passed since the last invocation.
 * @param {function} func - The function to be debounced.
 * @param {number} delay - The delay in milliseconds.
 * @returns {function} - The debounced function.
 */
function debounce(func, delay) {
  let timeoutId;

  return function (...args) {
    const context = this;

    // Clear the previous timeout
    clearTimeout(timeoutId);

    // Set a new timeout
    timeoutId = setTimeout(() => {
      func.apply(context, args);
    }, delay);
  };
}

module.exports = { debounce };
