"use strict";

const express = require("express");
const router = express.Router();

const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");


/* =========================================================
   TELEGRAM BOT CONFIG
========================================================= */

const BOT_TOKEN =
  process.env.BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  "";

const ADMIN_CHAT_ID =
  process.env.ADMIN_CHAT_ID ||
  "";

const WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  "";


/* =========================================================
   TELEGRAM API
========================================================= */

async function tgCall(
  method,
  payload = {}
) {
  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is not configured."
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(payload)
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Telegram API returned invalid JSON for ${method}`
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.description ||
      `Telegram API error: ${method}`
    );
  }

  return data;
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}


function isAdminChat(chatId) {
  if (!ADMIN_CHAT_ID) {
    return false;
  }

  return (
    normalizeId(chatId) ===
    normalizeId(ADMIN_CHAT_ID)
  );
}


function getCallbackData(
  callbackQuery
) {
  return (
    callbackQuery?.data ||
    ""
  );
}


function getWithdrawalId(
  callbackData
) {
  /*
    Supported formats:

    withdrawal:approve:<id>
    withdrawal:reject:<id>

    approve:<id>
    reject:<id>
  */

  const parts =
    String(callbackData)
      .split(":")
      .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return parts[parts.length - 1];
}


function getAction(
  callbackData
) {
  const value =
    String(callbackData)
      .toLowerCase();

  if (
    value.includes("approve")
  ) {
    return "approve";
  }

  if (
    value.includes("reject")
  ) {
    return "reject";
  }

  return null;
}


/* =========================================================
   ANSWER CALLBACK
========================================================= */

async function answerCallback(
  callbackId,
  text = "",
  showAlert = false
) {
  if (!callbackId) {
    return;
  }

  try {
    await tgCall(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,

        text,

        show_alert:
          Boolean(showAlert)
      }
    );
  } catch (error) {
    console.error(
      "answerCallbackQuery failed:",
      error.message
    );
  }
}


/* =========================================================
   EDIT ADMIN MESSAGE
========================================================= */

async function editAdminMessage(
  chatId,
  messageId,
  text,
  replyMarkup = undefined
) {
  if (!chatId || !messageId) {
    return;
  }

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text
  };

  if (replyMarkup !== undefined) {
    payload.reply_markup =
      replyMarkup;
  }

  try {
    await tgCall(
      "editMessageText",
      payload
    );
  } catch (error) {
    console.error(
      "editMessageText failed:",
      error.message
    );
  }
}


/* =========================================================
   WITHDRAWAL STATUS
========================================================= */

function withdrawalStatusText(
  status
) {
  switch (status) {
    case "pending":
      return "⏳ در انتظار بررسی";

    case "approved":
      return "✅ تأیید شده";

    case "rejected":
      return "❌ رد شده";

    default:
      return String(status || "");
  }
}


/* =========================================================
   APPROVE WITHDRAWAL
========================================================= */

async function approveWithdrawal(
  withdrawal,
  callbackQuery
) {
  /*
    Idempotency:
    اگر قبلاً تعیین تکلیف شده باشد،
    دوباره امتیاز یا وضعیت را تغییر نمی‌دهیم.
  */

  if (
    withdrawal.status !==
    "pending"
  ) {
    await answerCallback(
      callbackQuery.id,
      `این درخواست قبلاً ${withdrawalStatusText(withdrawal.status)} شده است.`,
      true
    );

    return;
  }

  withdrawal.status =
    "approved";

  withdrawal.processedAt =
    new Date();

  await withdrawal.save();


  const callbackMessage =
    callbackQuery.message;

  const oldText =
    callbackMessage?.text ||
    "درخواست برداشت";


  const newText =
    `${oldText}\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `🟢 وضعیت: تأیید شد\n` +
    `🕐 ${new Date().toLocaleString("fa-IR")}`;


  await editAdminMessage(
    callbackMessage?.chat?.id,
    callbackMessage?.message_id,
    newText,
    {
      inline_keyboard: []
    }
  );


  await answerCallback(
    callbackQuery.id,
    "برداشت با موفقیت تأیید شد.",
    false
  );


  /*
    اطلاع‌رسانی به کاربر، فقط اگر
    telegramId موجود باشد.
  */

  if (withdrawal.userId) {
    try {
      const user =
        await User.findById(
          withdrawal.userId
        );

      if (
        user?.telegramId
      ) {
        await tgCall(
          "sendMessage",
          {
            chat_id:
              user.telegramId,

            text:
              "✅ درخواست برداشت شما تأیید شد.\n\n" +
              `مقدار: ${withdrawal.amount} پوینت`
          }
        );
      }
    } catch (error) {
      console.error(
        "User approval notification failed:",
        error.message
      );
    }
  }
}


/* =========================================================
   REJECT WITHDRAWAL
========================================================= */

async function rejectWithdrawal(
  withdrawal,
  callbackQuery
) {
  /*
    بسیار مهم:
    فقط در حالت pending امتیازها
    دوباره به کاربر برگردانده می‌شوند.
  */

  if (
    withdrawal.status !==
    "pending"
  ) {
    await answerCallback(
      callbackQuery.id,
      `این درخواست قبلاً ${withdrawalStatusText(withdrawal.status)} شده است.`,
      true
    );

    return;
  }


  let user = null;

  if (withdrawal.userId) {
    user =
      await User.findById(
        withdrawal.userId
      );
  }


  if (user) {
    user.points =
      Number(user.points || 0) +
      Number(withdrawal.amount || 0);

    await user.save();
  }


  withdrawal.status =
    "rejected";

  withdrawal.processedAt =
    new Date();

  await withdrawal.save();


  const callbackMessage =
    callbackQuery.message;

  const oldText =
    callbackMessage?.text ||
    "درخواست برداشت";


  const newText =
    `${oldText}\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔴 وضعیت: رد شد\n` +
    `💰 امتیاز به حساب کاربر برگشت داده شد\n` +
    `🕐 ${new Date().toLocaleString("fa-IR")}`;


  await editAdminMessage(
    callbackMessage?.chat?.id,
    callbackMessage?.message_id,
    newText,
    {
      inline_keyboard: []
    }
  );


  await answerCallback(
    callbackQuery.id,
    "درخواست رد شد و امتیازها برگشت داده شدند.",
    false
  );


  /*
    اطلاع‌رسانی به کاربر
  */

  if (user?.telegramId) {
    try {
      await tgCall(
        "sendMessage",
        {
          chat_id:
            user.telegramId,

          text:
            "❌ درخواست برداشت شما رد شد.\n\n" +
            `مقدار ${withdrawal.amount} پوینت به موجودی شما برگشت داده شد.`
        }
      );
    } catch (error) {
      console.error(
        "User rejection notification failed:",
        error.message
      );
    }
  }
}


/* =========================================================
   CALLBACK QUERY HANDLER
========================================================= */

async function handleCallbackQuery(
  callbackQuery
) {
  if (!callbackQuery) {
    return;
  }

  const callbackData =
    getCallbackData(
      callbackQuery
    );


  /*
    فقط callbackهای مربوط به
    برداشت را پردازش می‌کنیم.

    هیچ message یا /start
    در این فایل پردازش نمی‌شود.
  */

  if (
    !callbackData ||
    (
      !callbackData.includes(
        "withdrawal"
      ) &&
      !callbackData.includes(
        "approve"
      ) &&
      !callbackData.includes(
        "reject"
      )
    )
  ) {
    await answerCallback(
      callbackQuery.id
    );

    return;
  }


  const chatId =
    callbackQuery
      ?.message
      ?.chat
      ?.id;


  /*
    فقط ادمین مجاز است.
  */

  if (!isAdminChat(chatId)) {
    await answerCallback(
      callbackQuery.id,
      "دسترسی مجاز نیست.",
      true
    );

    return;
  }


  const action =
    getAction(
      callbackData
    );

  const withdrawalId =
    getWithdrawalId(
      callbackData
    );


  if (
    !action ||
    !withdrawalId
  ) {
    await answerCallback(
      callbackQuery.id,
      "درخواست نامعتبر است.",
      true
    );

    return;
  }


  let withdrawal;

  try {
    withdrawal =
      await Withdrawal.findById(
        withdrawalId
      );
  } catch (error) {
    await answerCallback(
      callbackQuery.id,
      "شناسه درخواست نامعتبر است.",
      true
    );

    return;
  }


  if (!withdrawal) {
    await answerCallback(
      callbackQuery.id,
      "درخواست برداشت پیدا نشد.",
      true
    );

    return;
  }


  try {
    if (
      action === "approve"
    ) {
      await approveWithdrawal(
        withdrawal,
        callbackQuery
      );

      return;
    }


    if (
      action === "reject"
    ) {
      await rejectWithdrawal(
        withdrawal,
        callbackQuery
      );

      return;
    }


    await answerCallback(
      callbackQuery.id,
      "عملیات ناشناخته است.",
      true
    );

  } catch (error) {

    console.error(
      "Withdrawal callback failed:",
      error
    );

    await answerCallback(
      callbackQuery.id,
      "خطایی هنگام پردازش درخواست رخ داد.",
      true
    );
  }
}


/* =========================================================
   WEBHOOK
========================================================= */

router.post(
  "/webhook/:secret",
  async (req, res) => {

    /*
      Telegram باید خیلی سریع پاسخ 200 بگیرد.
      بنابراین قبل از پردازش، پاسخ می‌دهیم.
    */

    res.status(200).json({
      ok: true
    });


    /*
      بررسی Secret
    */

    const providedSecret =
      req.params.secret || "";

    if (
      !WEBHOOK_SECRET ||
      providedSecret !==
        WEBHOOK_SECRET
    ) {
      console.warn(
        "Telegram webhook rejected: invalid secret."
      );

      return;
    }


    const update =
      req.body || {};


    /*
      ======================================================
      IMPORTANT SECURITY RULE
      ======================================================

      این webhook عمداً فقط callback_query
      را پردازش می‌کند.

      موارد زیر نادیده گرفته می‌شوند:

      message
      edited_message
      channel_post
      edited_channel_post
      inline_query
      chosen_inline_result
      my_chat_member
      chat_member
      chat_join_request

      بنابراین این فایل به‌تنهایی:

      - /start ارسال نمی‌کند
      - پیام کانال ارسال نمی‌کند
      - کاربر را مجبور به join نمی‌کند
      - هنگام اضافه‌شدن bot به گروه پیام نمی‌فرستد
      ======================================================
    */


    if (
      !update.callback_query
    ) {
      return;
    }


    try {
      await handleCallbackQuery(
        update.callback_query
      );
    } catch (error) {
      console.error(
        "Telegram webhook processing error:",
        error
      );
    }
  }
);


/* =========================================================
   OPTIONAL HEALTH CHECK
========================================================= */

router.get(
  "/webhook-health",
  (req, res) => {

    res.status(200).json({
      ok: true,
      service:
        "telegram-webhook",
      callbackQueriesOnly: true,
      timestamp:
        new Date().toISOString()
    });

  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;