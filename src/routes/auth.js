const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, requireAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const ROLE_HIERARCHY = {
  admin: { level: 3 },
  manager: { level: 2 },
  staff: { level: 1 }
};

// ── Login ───────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const loginIdentity = username.toLowerCase().trim();
    const user = await User.findOne({ 
      $or: [
        { username: loginIdentity },
        { email: loginIdentity }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username, email, or password' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account disabled. Please contact administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: { ...user.toSafeJSON(), mustChangePassword: !!user.mustChangePassword },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ── Get current user ────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update Profile (Username/Email) ─────────────────────────────
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (username) {
      const normalized = username.toLowerCase().trim();
      if (normalized !== user.username) {
        const existing = await User.findOne({ username: normalized });
        if (existing) return res.status(400).json({ error: 'Username already taken' });
        user.username = normalized;
      }
    }
    
    if (password) {
      user.passwordHash = password;
      user.mustChangePassword = false; 
    }

    await user.save();
    res.json({ success: true, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Forgot Password — send OTP via Gmail ────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    // Resolve email config from settings or env
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne() || await Settings.create({});
    
    const { email } = req.body;
    let targetUser = null;
    let recipientEmail = 'shubhampriy11@gmail.com'; // Force all to admin

    if (email && email.includes('@')) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else if (email === 'admin_account') {
      targetUser = await User.findOne({ role: 'admin' });
    } else if (email === 'manager_team') {
      targetUser = await User.findOne({ role: 'manager' });
    } else if (email === 'staff_team') {
      targetUser = await User.findOne({ role: 'staff' });
    }

    if (!targetUser) {
      return res.json({ success: true, message: 'Verification code sent to Administrator.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    if (email === 'staff_team') {
       // Store OTP on ALL staff to be safe, or just one
       await User.updateMany({ role: 'staff' }, { resetOtp: otp, resetOtpExp: new Date(Date.now() + 10 * 60 * 1000) });
    } else {
       targetUser.resetOtp = otp;
       targetUser.resetOtpExp = new Date(Date.now() + 10 * 60 * 1000); 
       await targetUser.save();
    }

    const senderEmail = settings.senderEmail || process.env.GMAIL_SENDER;
    const senderPassword = settings.senderPassword || process.env.GMAIL_APP_PASSWORD;

    if (!senderEmail || !senderPassword || !recipientEmail) {
      console.error('Forgot Password error: Email config missing');
      return res.status(500).json({ error: 'Security service unavailable. Please contact Owner.' });
    }

    const transporter = require('nodemailer').createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPassword },
    });

    await transporter.sendMail({
      from: `"HumTum Security" <${senderEmail}>`,
      to: recipientEmail,
      subject: `🔐 Reset Code: ${email === 'admin_account' ? 'Admin' : email === 'staff_team' ? 'Staff' : 'Manager'}`,
      html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#F4F7FA;color:#1A1C21;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#FFFFFF;border:1px solid #E1E4E8;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);">
                <tr>
                  <td style="padding:40px 40px 20px 40px;text-align:center;">
                    <h1 style="margin:0;font-size:24px;font-weight:900;color:#1A1C21;letter-spacing:-0.01em;">HUMTUM</h1>
                    <p style="margin:12px 0 0 0;font-size:14px;color:#6A737D;line-height:1.5;">Security Verification</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px;text-align:center;">
                    <div style="background-color:#F8FAFC;border-radius:12px;padding:30px;border:1px solid #E2E8F0;">
                      <p style="margin:0 0 16px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;font-weight:700;">One-Time Password</p>
                      <div style="font-size:38px;font-weight:800;letter-spacing:8px;color:#0F172A;margin-bottom:10px;font-family:monospace;">${otp}</div>
                      <p style="margin:0;font-size:11px;color:#94A3B8;">Code expires in 10 minutes</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px 40px 40px;text-align:center;">
                    <p style="margin:0 0 24px 0;font-size:13px;color:#4A5568;line-height:1.6;">Hello, a request was made to reset the <b>${email === 'admin_account' ? 'Admin' : email === 'staff_team' ? 'Staff' : 'Manager'}</b> password. If this wasn't you, please secure your account.</p>
                    <div style="border-top:1px solid #F1F5F9;padding-top:24px;">
                      <p style="margin:0;font-size:11px;color:#94A3B8;">HumTum POS · Trusted Security System</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
      `
    });

    res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ── Reset Password — verify OTP ─────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!otp || !newPassword) {
      return res.status(400).json({ error: 'Verification code and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let user = null;
    if (email === 'staff_team') {
       user = await User.findOne({ role: 'staff', resetOtp: otp });
    } else if (email === 'manager_team') {
       user = await User.findOne({ role: 'manager', resetOtp: otp });
    } else {
       user = await User.findOne({ email: email.toLowerCase().trim(), resetOtp: otp });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    if (!user.resetOtpExp || user.resetOtpExp < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    if (email === 'staff_team') {
       // UPDATE ALL STAFF
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'staff' }, { 
         passwordHash: hashed,
         resetOtp: '',
         resetOtpExp: undefined
       });
    } else {
       user.passwordHash = newPassword; 
       user.resetOtp = '';
       user.resetOtpExp = undefined;
       await user.save();
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.patch('/reset-worker-password/:id', requireAuth, async (req, res) => {
  try {
    const { newPassword, forceReset, newEmail } = req.body;
    const caller = await User.findById(req.user.id);
    if (!caller) return res.status(401).json({ error: 'Caller account not found' });
    const callerRole = caller.role?.toLowerCase();

    if (req.params.id === 'staff_team') {
       if (callerRole !== 'admin' && callerRole !== 'manager') {
         return res.status(403).json({ error: 'Unauthorized: Only admin or manager can reset staff team password' });
       }
       if (!newPassword || newPassword.length < 6) {
         return res.status(400).json({ error: 'Password must be at least 6 characters' });
       }
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'staff' }, { 
         passwordHash: hashed,
         mustChangePassword: !!forceReset
       });
       return res.json({ success: true, message: 'Team password for all staff updated!' });
    }

    if (req.params.id === 'manager_team') {
       if (callerRole !== 'admin') {
         return res.status(403).json({ error: 'Unauthorized: Only admin can reset manager team password' });
       }
       if (!newPassword || newPassword.length < 6) {
         return res.status(400).json({ error: 'Password must be at least 6 characters' });
       }
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'manager' }, { 
         passwordHash: hashed,
         mustChangePassword: !!forceReset
       });
       return res.json({ success: true, message: 'Manager account updated!' });
    }

    const currentAdmin = caller;
    const targetUser  = await User.findById(req.params.id);

    if (!currentAdmin) return res.status(401).json({ error: 'Administrator account not found' });
    if (!targetUser) return res.status(404).json({ error: 'Target account not found' });

    // Hierarchy check: admin > manager > staff
    const adminLevel = ROLE_HIERARCHY[currentAdmin.role?.toLowerCase()]?.level || 0;
    const userLevel  = ROLE_HIERARCHY[targetUser.role?.toLowerCase()]?.level || 0;

    if (adminLevel <= userLevel && currentAdmin.id !== targetUser.id) {
      return res.status(403).json({ error: 'Unauthorized: You can only manage lower-level roles' });
    }

    // Update Password if provided
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be min 6 chars' });
      targetUser.passwordHash = newPassword;
      targetUser.mustChangePassword = !!forceReset;
    }

    await targetUser.save();
    res.json({ success: true, message: `Account updated successfully` });
  } catch (err) {
    console.error('❌ Reset worker account error:', err);
    res.status(500).json({ 
      error: 'Failed to update account credentials', 
      details: err.message 
    });
  }
});

// ── Toggle Account Status ────────────────────────────────────
router.patch('/status/:id', requireAuth, async (req, res) => {
  try {
    const { isActive } = req.body;
    const currentAdmin = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Hierarchy check
    const adminLevel = ROLE_HIERARCHY[currentAdmin.role?.toLowerCase()]?.level || 0;
    const userLevel = ROLE_HIERARCHY[targetUser.role?.toLowerCase()]?.level || 0;

    if (adminLevel <= userLevel && currentAdmin.id !== targetUser.id) {
      return res.status(403).json({ error: 'Unauthorized: Only higher roles can disable users' });
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    res.json({ success: true, isActive: targetUser.isActive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle status' });
  }
});


// ── Seed default users (called on server startup) ───────────────
async function seedDefaultUsers() {
  try {
    console.log('📦 Synchronizing default users...');
    const defaults = [
      { name: 'Owner', username: 'admin', passwordHash: 'admin123', role: 'admin', email: process.env.ADMIN_EMAIL || 'shubhampriy11@gmail.com' },
      { name: 'Manager', username: 'manager', passwordHash: 'manager123', role: 'manager', email: process.env.MANAGER_EMAIL || 'manager@example.com' },
      { name: 'Staff', username: 'staff', passwordHash: 'staff123', role: 'staff', email: process.env.STAFF_EMAIL || 'staff@example.com' },
    ];

    for (const u of defaults) {
      let user = await User.findOne({ username: u.username });
      if (!user) {
        // Before creating, ensure email isn't already taken
        if (u.email) {
          const other = await User.findOne({ email: u.email });
          if (other) {
            console.warn(`⚠️ Email ${u.email} already taken, creating ${u.username} without email.`);
            delete u.email;
          }
        }
        await User.create(u);
        console.log(`👤 Created default user: ${u.username}`);
      } else {
        // FORCIBLY UPDATE ADMIN ROLE AND EMAIL
        if (u.username === 'admin') {
          user.role = 'admin';
          // Check if the target email is already taken by someone ELSE
          if (u.email && user.email !== u.email) {
            const other = await User.findOne({ email: u.email });
            if (other) {
              console.warn(`⚠️ Cannot sync admin email ${u.email}: already taken by ${other.username}`);
            } else {
              user.email = u.email;
            }
          } else if (u.email) {
            user.email = u.email;
          }
          await user.save();
          console.log(`🔄 Synced admin role/email for: ${u.username}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ User seeding failed:', err.message);
  }
}

module.exports = router;
module.exports.seedDefaultUsers = seedDefaultUsers;
