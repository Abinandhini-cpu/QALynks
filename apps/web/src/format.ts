const dateOnly = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string): string => dateOnly.format(new Date(iso));
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
