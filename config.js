// API base URL. Points at a local backend during development, and the
// deployed Render service in production.
(function () {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const PROD_API_BASE = "https://business-assistant-api-s4ze.onrender.com/api";
  const LOCAL_API_BASE = "http://localhost:4000/api";
  window.API_BASE = isLocal ? LOCAL_API_BASE : PROD_API_BASE;
})();
