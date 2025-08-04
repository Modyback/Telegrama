const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const { saveOrder } = require('./db');
const { createInvoice } = require('./oxapay');
const config = require('./config.json');

const bot = new TelegramBot(config.telegram_token, { polling: true });

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'twitter', name: 'Twitter (X)' }
];

const SERVICES = {
  instagram: [
    { id: 'followers', name: 'Followers', pricePer1000: 15, minQuantity: 100, maxQuantity: 10000 },
    { id: 'likes', name: 'Likes', pricePer1000: 10, minQuantity: 50, maxQuantity: 5000 },
    { id: 'views', name: 'Views', pricePer1000: 8, minQuantity: 100, maxQuantity: 100000 }
  ],
  youtube: [
    { id: 'views', name: 'Views', pricePer1000: 17, minQuantity: 200, maxQuantity: 50000 },
    { id: 'subs', name: 'Subscribers', pricePer1000: 30, minQuantity: 50, maxQuantity: 2000 }
  ],
  tiktok: [
    { id: 'followers', name: 'Followers', pricePer1000: 14, minQuantity: 100, maxQuantity: 10000 },
    { id: 'likes', name: 'Likes', pricePer1000: 12, minQuantity: 100, maxQuantity: 8000 },
    { id: 'views', name: 'Views', pricePer1000: 9, minQuantity: 100, maxQuantity: 100000 }
  ],
  twitter: [
    { id: 'followers', name: 'Followers', pricePer1000: 18, minQuantity: 100, maxQuantity: 5000 },
    { id: 'likes', name: 'Likes', pricePer1000: 13, minQuantity: 50, maxQuantity: 3000 },
    { id: 'views', name: 'Views', pricePer1000: 15, minQuantity: 100, maxQuantity: 10000 }
  ]
};

const FIXED_TAX = 0.5;

const userStates = {};

function orderSummary(state) {
  return `🧾 <b>Order Summary</b>

<b>Platform:</b> ${state.platform ? state.platform.name : '[not selected]'}
<b>Service:</b> ${state.service ? state.service.name : '[not selected]'}
<b>Username/Channel:</b> ${state.username || '[not set]'}
<b>Quantity:</b> ${state.quantity || '[not set]'}
<b>Subtotal:</b> $${state.subtotal || '[not set]'}
<b>Tax:</b> $${FIXED_TAX.toFixed(2)}
<b>Total:</b> <u>$${state.price || '[not set]'}</u>

Press <b>Pay</b> to proceed with payment, or <b>Back</b> to edit your order.`;
}

// --- Start Bot ---
bot.onText(/\/start/, (msg) => {
  sendPlatformSelection(msg.chat.id);
  userStates[msg.from.id] = { step: 'platform' };
});

// Step 1: Platform selection
function sendPlatformSelection(chatId) {
  bot.sendMessage(chatId, '🌐 <b>Select a Platform</b>:', {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: PLATFORMS.map(p => [{ text: p.name, callback_data: `platform_${p.id}` }])
    }
  });
}

// Step 2: Service selection
function sendServiceSelection(chatId, platformId) {
  bot.sendMessage(chatId, `📱 <b>${PLATFORMS.find(x => x.id === platformId).name}</b>\n\nChoose a service:`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: SERVICES[platformId].map(s =>
        [{ text: s.name, callback_data: `service_${s.id}` }]
      ).concat([[{ text: '⬅️ Back', callback_data: 'back_platform' }]])
    }
  });
}

// Inline Keyboard Logic
bot.on('callback_query', async (cbq) => {
  const uid = cbq.from.id;
  userStates[uid] = userStates[uid] || {};
  const state = userStates[uid];

  // Choose platform
  if (cbq.data.startsWith('platform_')) {
    const pid = cbq.data.replace('platform_', '');
    const platform = PLATFORMS.find(p => p.id === pid);
    if (platform) {
      state.platform = platform;
      state.service = null;
      state.username = null;
      state.quantity = null;
      state.price = null;
      state.subtotal = null;
      state.step = 'service';
      bot.editMessageText(
        `🌐 <b>Platform:</b> ${platform.name}\n\nChoose a service:`,
        { chat_id: cbq.message.chat.id, message_id: cbq.message.message_id, parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: SERVICES[pid].map(s =>
              [{ text: s.name, callback_data: `service_${s.id}` }]
            ).concat([[{ text: '⬅️ Back', callback_data: 'back_platform' }]])
          }
        }
      );
    }
    return bot.answerCallbackQuery(cbq.id);
  }

  // Back to platform selection
  if (cbq.data === 'back_platform') {
    sendPlatformSelection(cbq.message.chat.id);
    userStates[uid] = { step: 'platform' };
    return bot.answerCallbackQuery(cbq.id);
  }

  // Choose service
  if (cbq.data.startsWith('service_')) {
    if (!state.platform) return;
    const sid = cbq.data.replace('service_', '');
    const service = SERVICES[state.platform.id].find(s => s.id === sid);
    if (service) {
      state.service = service;
      state.username = null;
      state.quantity = null;
      state.price = null;
      state.subtotal = null;
      state.step = 'username';
      bot.editMessageText(
        `🛠 <b>Service:</b> ${service.name}\n\nNow enter the username/channel (no @, no link):`,
        { chat_id: cbq.message.chat.id, message_id: cbq.message.message_id, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_service' }]] }
        }
      );
    }
    return bot.answerCallbackQuery(cbq.id);
  }

  // Back to service selection
  if (cbq.data === 'back_service') {
    if (!state.platform) return;
    sendServiceSelection(cbq.message.chat.id, state.platform.id);
    state.service = null;
    state.username = null;
    state.quantity = null;
    state.price = null;
    state.subtotal = null;
    state.step = 'service';
    return bot.answerCallbackQuery(cbq.id);
  }

  // Back to username input
  if (cbq.data === 'back_username') {
    if (!state.platform || !state.service) return;
    bot.sendMessage(cbq.message.chat.id, 'Please enter the username/channel (no @, no link):', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_service' }]] }
    });
    state.username = null;
    state.quantity = null;
    state.price = null;
    state.subtotal = null;
    state.step = 'username';
    return bot.answerCallbackQuery(cbq.id);
  }

  // Back to quantity input
  if (cbq.data === 'back_quantity') {
    bot.sendMessage(cbq.message.chat.id, 'Please enter the quantity again:', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_username' }]] }
    });
    state.quantity = null;
    state.price = null;
    state.subtotal = null;
    state.step = 'quantity';
    return bot.answerCallbackQuery(cbq.id);
  }

  // Order summary - Back and Pay
  if (cbq.data === 'back_summary') {
    bot.sendMessage(cbq.message.chat.id, 'Please enter the quantity again:', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_username' }]] }
    });
    state.quantity = null;
    state.price = null;
    state.subtotal = null;
    state.step = 'quantity';
    return bot.answerCallbackQuery(cbq.id);
  }

  // Pay logic
  if (cbq.data === 'pay') {
    if (!state.platform || !state.service || !state.username || !state.quantity || !state.price) {
      bot.answerCallbackQuery(cbq.id, { text: 'Order not complete!', show_alert: true });
      return;
    }
    bot.editMessageText('Creating payment invoice...', {
      chat_id: cbq.message.chat.id,
      message_id: cbq.message.message_id
    });
    const order_id = uuidv4();
    const description = `${state.platform.name} ${state.service.name} for ${state.username} (${state.quantity})`;
    try {
      const payment_url = await createInvoice({
        amount: state.price,
        order_id,
        description
      });
      saveOrder({
        id: order_id,
        userId: uid,
        platform: state.platform.name,
        service: state.service.name,
        username: state.username,
        quantity: state.quantity,
        price: state.price,
        payment_url,
        status: 'pending'
      });
      bot.sendMessage(cbq.message.chat.id, `✅ Your order is ready. Please pay to complete:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Pay Now', url: payment_url }]
          ]
        }
      });
      userStates[uid] = { step: 'platform' };
    } catch (e) {
      bot.sendMessage(cbq.message.chat.id, '❌ Error creating payment invoice. Please try again.');
      console.error(e);
    }
    return bot.answerCallbackQuery(cbq.id);
  }
});

// --- TEXT Steps ---
bot.on('message', (msg) => {
  if (msg.text.startsWith('/')) return;
  const uid = msg.from.id;
  if (!userStates[uid]) return;
  const state = userStates[uid];

  // Step: Username
  if (state.step === 'username') {
    const username = msg.text.replace('@', '').trim();
    if (!/^[a-zA-Z0-9._\-]{3,100}$/.test(username)) {
      bot.sendMessage(msg.chat.id, 'Invalid username. Please send a valid username/channel (no @, no link):', {
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_service' }]] }
      });
      return;
    }
    state.username = username;
    state.quantity = null;
    state.price = null;
    state.subtotal = null;
    state.step = 'quantity';
    bot.sendMessage(msg.chat.id, `How many do you want? (min: ${state.service.minQuantity}, max: ${state.service.maxQuantity})`, {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_username' }]] }
    });
    return;
  }

  // Step: Quantity
  if (state.step === 'quantity') {
    if (!/^\d+$/.test(msg.text)) {
      bot.sendMessage(msg.chat.id, 'Quantity should be a number.', {
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_username' }]] }
      });
      return;
    }
    const quantity = parseInt(msg.text);
    if (quantity < state.service.minQuantity || quantity > state.service.maxQuantity) {
      bot.sendMessage(
        msg.chat.id,
        `❌ Allowed quantity for ${state.service.name}: min ${state.service.minQuantity}, max ${state.service.maxQuantity}\nPlease enter again:`,
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'back_username' }]] } }
      );
      return;
    }
    state.quantity = quantity;
    state.subtotal = ((quantity / 1000) * state.service.pricePer1000).toFixed(2);
    state.price = (parseFloat(state.subtotal) + FIXED_TAX).toFixed(2);
    state.step = 'summary';
    bot.sendMessage(msg.chat.id, orderSummary(state), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Pay', callback_data: 'pay' }, { text: '⬅️ Back', callback_data: 'back_summary' }]
        ]
      }
    });
    return;
  }
});
