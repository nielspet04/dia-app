export const MAX_GUEST_NAME_LENGTH = 80;
export const SESSION_STORAGE_KEY = 'trouw-upload-session-id';
export const GUEST_NAME_STORAGE_KEY = 'trouw-upload-guest-name';

export const getUploadSessionId = () => {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
};

export const getSavedGuestName = () => localStorage.getItem(GUEST_NAME_STORAGE_KEY) || '';

export const saveGuestName = (guestName) => {
  localStorage.setItem(GUEST_NAME_STORAGE_KEY, guestName);
};

export const resetUploadSession = () => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  return getUploadSessionId();
};
