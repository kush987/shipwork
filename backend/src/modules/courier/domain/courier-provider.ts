/** Raised by adapters for transient upstream failures (5xx, network, timeouts). */
export class CourierUnavailableError extends Error {
  constructor(
    readonly courierCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'CourierUnavailableError';
  }
}

/** Raised by adapters when the courier rejects the request; retrying will not help. */
export class CourierRejectedError extends Error {
  constructor(
    readonly courierCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'CourierRejectedError';
  }
}

/** A workflow asked for a courier account (sandbox or live) that isn't set up on the Couriers page. */
export class CourierNotConnectedError extends CourierRejectedError {}
