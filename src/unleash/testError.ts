// The body Unleash sends with an error reply: `details` is where toFailed reads the reasons from.
export const unleashError = (name: string, message: string) => ({
  id: '0b84c7fd-5278-4087-832d-0b502c7929b3',
  name,
  message,
  details: [{ message }],
});
