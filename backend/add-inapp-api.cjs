const fs = require('fs');
const path = './server.ts';
let content = fs.readFileSync(path, 'utf8');
const insertionPoint = '// ---------------- BACKGROUND WORKER (SLA & Retention) ----------------';
const newApi = `app.get('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configs = await prisma.inAppNotificationConfig.findMany();
    res.json(configs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configData = req.body; // Array of configs
    // Delete all and insert new ones
    await prisma.inAppNotificationConfig.deleteMany();
    if (configData && configData.length > 0) {
      await prisma.inAppNotificationConfig.createMany({ data: configData });
    }
    res.json({ message: 'Saved successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

`;
content = content.replace(insertionPoint, newApi + insertionPoint);
fs.writeFileSync(path, content, 'utf8');
