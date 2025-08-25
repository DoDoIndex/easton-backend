export const unauthorized = (res, message = 'Unauthorized') => {
  res.status(401).json({ error: message });
};

export const forbidden = (res, message = 'Forbidden') => {
  res.status(403).json({ error: message });
}; 