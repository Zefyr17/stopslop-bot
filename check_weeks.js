const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function checkWeeks() {
  try {
    const activeWeeks = await prisma.week.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    console.log('\n=== ACTIVE WEEKS ===');
    console.log('Total active weeks:', activeWeeks.length);
    activeWeeks.forEach((week, index) => {
      console.log(`\nWeek ${index + 1}:`);
      console.log('  ID:', week.id);
      console.log('  monitoredChannelId:', week.monitoredChannelId || 'null (global)');
      console.log('  startDate:', week.startDate);
      console.log('  createdAt:', week.createdAt);
    });

    const recentPosts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { week: true }
    });

    console.log('\n=== RECENT POSTS ===');
    recentPosts.forEach((post, index) => {
      console.log(`\nPost ${index + 1}:`);
      console.log('  ID:', post.id);
      console.log('  monitoredChannelId:', post.monitoredChannelId || 'null');
      console.log('  weekId:', post.weekId);
      console.log('  week.monitoredChannelId:', post.week.monitoredChannelId || 'null');
      console.log('  reviewMessageId:', post.reviewMessageId || 'null');
      console.log('  status:', post.status);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWeeks();
