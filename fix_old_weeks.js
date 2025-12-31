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

async function fixOldWeeks() {
  try {
    console.log('🔍 Checking for old global active weeks...');

    // Find all ACTIVE weeks that don't have a monitoredChannelId (old global weeks)
    const oldGlobalWeeks = await prisma.week.findMany({
      where: {
        status: 'ACTIVE',
        monitoredChannelId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${oldGlobalWeeks.length} old global active weeks`);

    if (oldGlobalWeeks.length > 0) {
      console.log('\n⚠️  Old global weeks that should be closed:');
      oldGlobalWeeks.forEach((week, index) => {
        console.log(`  ${index + 1}. Week ID: ${week.id}, Created: ${week.createdAt}`);
      });

      console.log('\n🔧 Closing old global active weeks...');

      const result = await prisma.week.updateMany({
        where: {
          status: 'ACTIVE',
          monitoredChannelId: null
        },
        data: {
          status: 'CLOSED'
        }
      });

      console.log(`✅ Closed ${result.count} old global week(s)`);
    } else {
      console.log('✅ No old global active weeks found - everything is clean!');
    }

    // Show current active weeks
    const activeWeeks = await prisma.week.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n📊 Current active weeks: ${activeWeeks.length}`);
    activeWeeks.forEach((week, index) => {
      console.log(`  ${index + 1}. Week ID: ${week.id}`);
      console.log(`     Channel: ${week.monitoredChannelId || 'null (global)'}`);
      console.log(`     Created: ${week.createdAt}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

fixOldWeeks();
