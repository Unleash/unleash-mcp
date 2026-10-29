/** Tells the time, so a tool never reads the system clock itself and a test can fix it. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
