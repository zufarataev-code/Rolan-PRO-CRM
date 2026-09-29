/**
 * One password rule for every place a password is set: owner-issued
 * temporary passwords, self-service change, and email reset. Different
 * minimums used to let an owner issue a 10-character password that the
 * employee could then not keep.
 */
export const PASSWORD_MIN_LENGTH = 12;
