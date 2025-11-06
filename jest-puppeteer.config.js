module.exports = {
  launch: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: {
      width: 1366,
      height: 768,
    },
    protocolTimeout: 180000, // 3 minutes
  },
  browserContext: 'default',
};
