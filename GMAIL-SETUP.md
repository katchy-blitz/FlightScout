# Send sign-up codes from your own Gmail (free, no new service)

1. Go to script.google.com while signed in to the Gmail you want to send from. Click **New project**.
2. Delete everything in the editor and paste this (change MY_SECRET to a long random text you invent):

```js
const SECRET = "MY_SECRET";
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: "bad secret" });
    MailApp.sendEmail({ to: d.to, subject: d.subject, body: d.text, htmlBody: d.html, name: d.name });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)); }
```
3. Click **Deploy > New deployment**, the gear icon > **Web app**. Execute as: **Me**. Who has access: **Anyone**. Click Deploy.
4. Google asks you to authorise: click Authorise, choose your account, Advanced, "Go to ... (unsafe)", Allow. (It is your own script.)
5. Copy the **Web app URL** (ends in /exec).
6. In `.env` and on Render set:
   GAS_MAIL_URL=<the /exec URL>
   GAS_MAIL_SECRET=<the same MY_SECRET>
   and remove BREVO_API_KEY / RESEND_API_KEY.
7. Restart, sign up with another email address, and check the code arrives (look in Spam too).

Gmail limits how many emails a free account can send per day (around 100), which is plenty for judging.
Keep SHOW_CODE_ON_SCREEN=true as a safety net: if sending ever fails, the code still appears on screen.
If you change the script later, use Deploy > Manage deployments > edit > New version.
