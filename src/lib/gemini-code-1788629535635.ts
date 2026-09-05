function getAliExpressTimestamp(): string {
  const now = new Date();
  // Adjust current time to UTC+8 (Beijing Time)
  const utc8 = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${utc8.getFullYear()}-${pad(utc8.getMonth() + 1)}-${pad(utc8.getDate())} ${pad(utc8.getHours())}:${pad(utc8.getMinutes())}:${pad(utc8.getSeconds())}`;
}