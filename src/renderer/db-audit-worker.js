importScripts('cairm-runtime.js', 'db-maintenance.js', 'db-audit.js');
self.onmessage = ({ data }) => {
  try {
    const report = CairmDbAudit.scan(data.db, progress => self.postMessage({ progress }));
    self.postMessage({ report });
  } catch (error) { self.postMessage({ error: error.message }); }
};
