'use strict';

const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/;

function parseTelegramStart(text) {
  const match = START_COMMAND.exec(String(text || '').trim());
  return match ? { payload: match[1] || null } : null;
}

function buildMiniAppUrl(appUrl, payload, isNewUser) {
  if (!appUrl) return '';
  try {
    const url = new URL(String(appUrl));
    // Referral payloads are only applied to a newly registered account.
    if (isNewUser && payload) url.searchParams.set('ref', payload);
    return url.toString();
  } catch {
    return '';
  }
}

async function handleTelegramStart({
  message,
  bot,
  User,
  appUrl,
  generateReferralCode,
  linkReferralByCode,
  botText,
  logger = console
}) {
  const command = parseTelegramStart(message?.text);
  if (!command) return null;
  if (!message?.from?.id || !message?.chat?.id || !bot || !User) {
    throw new TypeError('A valid Telegram message, bot client, and User model are required.');
  }

  const telegramId = String(message.from.id);
  let user = await User.findOne({ telegramId });
  let isNewUser = !user;

  if (!user) {
    try {
      user = await User.create({
        telegramId,
        username: message.from.username || '',
        firstName: message.from.first_name || '',
        lastName: message.from.last_name || '',
        referralCode: generateReferralCode(telegramId)
      });
    } catch (error) {
      // Concurrent Telegram deliveries can race on User.telegramId's unique index.
      if (error?.code !== 11000) throw error;
      user = await User.findOne({ telegramId });
      if (!user) throw error;
      isNewUser = false;
    }
  }

  if (isNewUser && command.payload) {
    try {
      await linkReferralByCode({ referredUserId: user._id, referralCode: command.payload, source: 'signup' });
    } catch (error) {
      logger.error('Referral /start linking failed; Mini App fallback will retry:', error.message || error);
    }
  }

  const webAppUrl = buildMiniAppUrl(appUrl, command.payload, isNewUser);
  const replyMarkup = webAppUrl
    ? { inline_keyboard: [[{ text: '🚀 Open GramUp', web_app: { url: webAppUrl } }]] }
    : undefined;
  const language = user.language || 'fa';
  const fallbackName = language === 'en' ? 'friend' : 'دوست عزیز';
  const name = message.from.first_name || fallbackName;
  const options = replyMarkup ? { reply_markup: replyMarkup } : {};

  await bot.sendMessage(
    message.chat.id,
    botText('welcome', language, name),
    options
  );

  return {
    isNewUser,
    hadReferralPayload: Boolean(command.payload),
    welcomeSent: true,
    hasMiniAppButton: Boolean(replyMarkup)
  };
}

module.exports = { parseTelegramStart, buildMiniAppUrl, handleTelegramStart };
