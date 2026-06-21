const fs = require('fs');
const path = require('path');
const os = require('os');

function setupDownloadDir(name) {
  const dir = path.join(os.tmpdir(), `grm-sync-${name}`);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function waitForFileDownload(dir, maxWaitMs) {
  const startTime = Date.now();
  const checkInterval = 500;

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const files = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

      if (files.length > 0) {
        clearInterval(timer);
        const downloaded = path.join(dir, files[0]);
        if (!downloaded.endsWith('.xlsx') && !downloaded.endsWith('.xls')) {
          const renamed = `${downloaded}.xlsx`;
          fs.renameSync(downloaded, renamed);
          resolve(renamed);
        } else {
          resolve(downloaded);
        }
        return;
      }

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(timer);
        reject(new Error('Timeout aguardando download do arquivo'));
      }
    }, checkInterval);
  });
}

async function prepareDownload(page, tempDir) {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: tempDir,
    eventsEnabled: true,
  });
}

async function triggerAndWaitForDownload(page, xlsSelector, tempDir, timeoutMs = 90000) {
  await prepareDownload(page, tempDir);
  await page.waitForSelector(xlsSelector, { timeout: 15000 });
  await page.click(xlsSelector);

  try {
    return await waitForFileDownload(tempDir, timeoutMs);
  } catch (err) {
    console.log(`[DEBUG] conteúdo de ${tempDir}: ${JSON.stringify(fs.readdirSync(tempDir))}`);
    console.log(`[DEBUG] page.url(): ${page.url()}`);
    throw err;
  }
}

module.exports = { setupDownloadDir, prepareDownload, triggerAndWaitForDownload, waitForFileDownload };
