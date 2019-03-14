const { Telegram, Composer } = require('telegraf')
const composer = new Composer()
const Mangadex = require('mangadex-api').default
const mangadexClient = new Mangadex({ shareMangaCache: true, shareChapterCache: true })
const { templates, setCurrentlyReading } = require('../lib')
const Chapter = require('../lib/chapter')
const client = new Telegram(process.env.BOT_TOKEN)

composer.action([
  /^chapter=(\S+):prev=(\S+):next=(\S+):offset=(\S+?):(\S+)$/i,
  /^chapter=(\S+):read=(\S+):next=(\S+):offset=(\S+?):(\S+)$/i,
  /^chapter=(\S+):read=(\S+):copy=(\S+):offset=(\S+?):(\S+)$/i
], async ctx => {
  // console.log(ctx.match)
  const chapterId = ctx.match[1]
  const markedRead = ctx.match[2] === 'true'
  const copy = ctx.match[3] === 'true'
  const offset = ctx.match[4]
  const history = ctx.match[5]
  let chapter = await mangadexClient.getChapter(chapterId)
  const { manga } = await mangadexClient.getManga(chapter.manga_id, false)
  let cachingChapter
  try {
    cachingChapter = await Chapter(chapter, manga, ctx.me)
  } catch (e) {
    return ctx.answerCbQuery(e.message, true, { cache_time: 10 })
  }
  if (cachingChapter.done) {
    chapter.telegraph = cachingChapter.telegraph
    const keyboard = [
      [
        {
          text: markedRead ? 'Mark unread' : 'Mark read',
          callback_data: `read:${chapterId}`
        },
        {
          text: 'Instant View',
          url: chapter.telegraph
        },
        {
          text: 'Share',
          switch_inline_query: `chapter:${chapterId}`
        }, {
          text: '🔗',
          callback_data: `sharechapter=${chapterId}`
        }
      ],
      [
        {
          text: 'Chapter list',
          callback_data: `chapterlist=${chapter.lang_code}:id=${chapter.manga_id}:offset=${offset}:${history}`
        },
        {
          text: 'Manga description',
          callback_data: `manga=${chapter.manga_id}:${history}`
        },
        {
          text: 'Copy',
          callback_data: `chapter=${chapterId}:read=${ctx.match[2]}:copy=true:offset=${offset}:${history}`
        }
      ],
      manga.links['mal'] ? [
        {
          text: 'Track reading on MAL',
          url: `https://myanimelist.net/manga/${manga.links['mal']}`
        }
      ] : undefined
    ].filter(Boolean)
    const messageText = templates.manga.chapter(chapter, manga, ctx.callbackQuery.message)
    if (copy) {
      ctx.answerCbQuery('')
      ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard
        }
      })
    } else {
      ctx.answerCbQuery('')
      ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard
        }
      })
    }
    setCurrentlyReading(chapter.manga_id, chapterId, ctx.state.user)
  } else {
    const queue = emitChapterStatusPool()
    const msg = await ctx.reply(cachingChapter.cached > 0 ? `${cachingChapter.cached} pictures already cached...` : `Chapter isn't cached yet, starting caching chapter ${chapter.chapter}...`, {
      reply_to_message_id: ctx.callbackQuery.message.message_id
    })
    const onUploaded = () => {
      queue(msg.chat.id, msg.message_id, `Chapter ${chapter.chapter}
Cached ${cachingChapter.cached + 1} of ${cachingChapter.total} pages.`)
    }

    const onDone = async () => {
      clearListeners()
      await ctx.collection('chapters').create({
        id: chapter.id,
        telegraph: cachingChapter.telegraph,
        timestamp: chapter.timestamp,
        manga_id: chapter.manga_id,
        manga_title: manga.title,
        title: chapter.title,
        volume: chapter.volume,
        chapter: chapter.chapter,
        lang: chapter.lang_code
      })
      // client.deleteMessage(msg.chat.id, msg.message_id)
      try {
        await client.editMessageText(
          msg.chat.id,
          msg.message_id,
          undefined,
          `${manga.title}\n${templates.chapter.formatChapter(chapter)} in ${chapter.lang_name} ready for reading!`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Ok!',
                    callback_data: 'delete'
                  },
                  {
                    text: 'Load chapter',
                    callback_data: `chapter=${chapter.id}:read=false:copy=false:offset=${offset}:${history}`
                  }
                ]
              ]
            }
          }
        )
      } catch (e) {
        console.log(e)
      }
    }

    const onError = err => {
      ctx.telegram.editMessageText(
        msg.chat.id,
        msg.message_id,
        undefined,
        `Error: ${err.message}`
      )
    }

    const clearListeners = () => {
      cachingChapter.removeListener('uploaded', onUploaded)
      cachingChapter.removeListener('done', onDone)
      cachingChapter.removeListener('error', onError)
    }
    cachingChapter.on('uploaded', onUploaded)
    cachingChapter.once('done', onDone)
    cachingChapter.on('error', onError)

    await cachingChapter.cache()
  }
})

composer.action([
  /^list=(\S+?):chapter=(\S+):read=(\S+):copy=(\S+):offset=([0-9]+)/i
], async ctx => {
  // console.log(ctx.match)
  const list = ctx.match[1]
  const chapterId = ctx.match[2]
  const markedRead = ctx.match[3] === 'true'
  const copy = ctx.match[4] === 'true'
  const offset = ctx.match[5]
  const history = ctx.match[6]
  let chapter = await mangadexClient.Chapter(chapterId)
  const { manga } = await mangadexClient.getManga(chapter.manga_id, false)
  let cachingChapter
  try {
    cachingChapter = await Chapter(chapter, manga, ctx.me)
  } catch (e) {
    return ctx.answerCbQuery(e.message, true, { cache_time: 10 })
  }
  if (cachingChapter.done) {
    chapter.telegraph = cachingChapter.telegraph
    const keyboard = [
      [
        {
          text: markedRead ? 'Mark unread' : 'Mark read',
          callback_data: `read:${chapterId}`
        },
        {
          text: 'Instant View',
          url: chapter.telegraph
        },
        {
          text: 'Share',
          switch_inline_query: `chapter:${chapterId}`
        }, {
          text: '🔗',
          callback_data: `sharechapter=${chapterId}`
        }
      ],
      [
        {
          text: 'Chapter list',
          callback_data: `${list ? `list=${list}:` : ''}chapterlist=${chapter.lang_code}:id=${chapter.manga_id}:offset=${offset}${list ? '' : `:${history}`}`
        },
        {
          text: 'Manga description',
          callback_data: `${list ? `list=${list}:` : ''}manga=${chapter.manga_id}${list ? '' : `:${history}`}`
        },
        {
          text: 'Copy',
          callback_data: `${list ? `list=${list}:` : ''}chapter=${chapterId}:read=${ctx.match[3]}:copy=true:offset=${offset}${list ? '' : `:${history}`}`
        }
      ],
      manga.links['mal'] ? [
        {
          text: 'Track reading on MAL',
          url: `https://myanimelist.net/manga/${manga.links['mal']}`
        }
      ] : undefined
    ].filter(Boolean)
    const messageText = templates.manga.chapter(chapter, manga, ctx.callbackQuery.message, list ? `<b>List:</b> ${list.match(/([a-z]+)/i)[1]}` : '')
    if (copy) {
      ctx.answerCbQuery('')
      ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard
        }
      })
    } else {
      ctx.answerCbQuery('')
      ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard
        }
      })
    }
    setCurrentlyReading(chapter.manga_id, chapterId, ctx.state.user)
  } else {
    const queue = emitChapterStatusPool()
    const msg = await ctx.reply(cachingChapter.cached > 0 ? `${cachingChapter.cached} pictures already cached...` : `Chapter isn't cached yet, starting caching chapter ${chapter.chapter}...`, {
      reply_to_message_id: ctx.callbackQuery.message.message_id
    })
    const onUploaded = () => {
      queue(msg.chat.id, msg.message_id, `Chapter ${chapter.chapter}
Cached ${cachingChapter.cached + 1} of ${cachingChapter.total} pages.`)
    }

    const onDone = async () => {
      clearListeners()
      await ctx.collection('chapters').create({
        id: chapter.id,
        telegraph: cachingChapter.telegraph,
        timestamp: chapter.timestamp,
        manga_id: chapter.manga_id,
        manga_title: manga.title,
        title: chapter.title,
        volume: chapter.volume,
        chapter: chapter.chapter,
        lang: chapter.lang_code
      })
      // client.deleteMessage(msg.chat.id, msg.message_id)
      try {
        await client.editMessageText(
          msg.chat.id,
          msg.message_id,
          undefined,
          `${manga.title}\n${templates.chapter.formatChapter(chapter)} in ${chapter.lang_name} ready for reading!`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Ok!',
                    callback_data: 'delete'
                  },
                  {
                    text: 'Load chapter',
                    callback_data: `${list ? `list=${list}:` : ''}chapter=${chapter.id}:read=false:copy=false:offset=${offset}${list ? '' : `:${history}`}`
                  }
                ]
              ]
            }
          }
        )
      } catch (e) {
        console.log(e)
      }
    }

    const onError = err => {
      ctx.telegram.editMessageText(
        msg.chat.id,
        msg.message_id,
        undefined,
        `Error: ${err.message}`
      )
    }

    const clearListeners = () => {
      cachingChapter.removeListener('uploaded', onUploaded)
      cachingChapter.removeListener('done', onDone)
      cachingChapter.removeListener('error', onError)
    }
    cachingChapter.on('uploaded', onUploaded)
    cachingChapter.once('done', onDone)
    cachingChapter.on('error', onError)
    await cachingChapter.cache()
  }
})

module.exports = app => {
  app.use(composer.middleware())
}

const emitChapterStatusPool = () => {
  let blocked = false
  setInterval(() => {
    blocked = false
  }, 2500)

  return async (chatId, messageId, message) => {
    if (blocked) { return }
    blocked = true
    try {
      client.editMessageText(
        chatId,
        messageId,
        undefined,
        message
      )
    } catch (e) {}
  }
}
