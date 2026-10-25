/**
 * Rate limits configured from the environment at startup. Kept in a module
 * object because @Throttle decorators are evaluated before DI is available.
 */
export const rateLimits = {
  authPerMinute: 10,
};
