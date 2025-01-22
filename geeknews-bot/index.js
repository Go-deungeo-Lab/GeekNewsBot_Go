const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const GEEKNEWS_URL = 'https://news.hada.io/';
const CHANNEL_ID = process.env.YOUR_DISCORD_CHANNEL_ID;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Running test fetch...');
    fetchAndSendNews();
});

async function fetchAndSendNews() {
    console.log('Fetching GeekNews feed...');
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        });

        const page = await browser.newPage();

        // 요청 가로채기 및 로깅
        page.on('request', request => {
            console.log('Request:', request.url());
        });

        page.on('response', response => {
            console.log('Response:', response.url(), response.status());
        });

        console.log('Browser launched, navigating to page...');

        await page.goto(GEEKNEWS_URL, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('Page loaded, analyzing content...');

        // 페이지의 현재 HTML 내용을 확인
        const content = await page.content();
        console.log('Page content sample:', content.slice(0, 200));

        // 모든 링크 요소 찾기
        const newsItems = await page.evaluate(() => {
            console.log('Starting page evaluation...');
            const links = Array.from(document.querySelectorAll('a'));
            console.log('Found links:', links.length);

            return links
                .filter(link => link.href.includes('/topic?id='))
                .map(link => ({
                    title: link.textContent.trim(),
                    id: link.href.split('id=')[1],
                    url: link.href
                }))
                .filter(item => item.title && item.id);
        });

        console.log('Found news items:', newsItems);

        if (newsItems.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID);
            let message = `📢 **GeekNews 최신 소식**\n\n`;

            // 중복 제거 및 최근 5개 항목만 표시
            const uniqueItems = [...new Map(newsItems.map(item => [item.id, item])).values()];
            uniqueItems.slice(0, 5).forEach(article => {
                message += `- **${article.title}**\n` +
                    `🔗 https://news.hada.io/topic?id=${article.id}\n\n`;
            });

            await channel.send(message);
            console.log(`Successfully sent ${uniqueItems.length} articles`);
        } else {
            console.log('No articles found');
            // 디버깅을 위해 스크린샷 저장
            await page.screenshot({
                path: 'debug.png',
                fullPage: true
            });
            console.log('Debug screenshot saved as debug.png');
        }
    } catch (error) {
        console.error('Error during test:', error);
        if (error.message.includes('net::ERR_')) {
            console.log('Network error detected. Please check your internet connection.');
        }
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed');
        }
    }
}

// 매일 아침 9시에 실행
cron.schedule('0 9 * * *', async () => {
    console.log('Running scheduled fetch...');
    fetchAndSendNews();
});

client.login(process.env.DISCORD_BOT_TOKEN);