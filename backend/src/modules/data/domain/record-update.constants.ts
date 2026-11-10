/** The update operators a change may use (MongoDB's names). */
export const UPDATE_OPERATORS = ['$set', '$unset', '$inc', '$mul', '$min', '$max', '$push', '$addToSet', '$pull', '$currentDate', '$setOnInsert'] as const;

/** Modifiers $push takes ($addToSet takes $each only). */
export const PUSH_MODIFIERS = ['$each', '$slice', '$position'];

/** Conditions $pull may use to pick the items it removes. */
export const PULL_OPERATORS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin'];

/** Items one $push / $addToSet may add. */
export const MAX_EACH = 1000;
