import { PrismaClient } from '@prisma/client';

const connectionString = "postgresql://portfolio_user:portfolio_secure_password@localhost:5432/portfolio_tracker_db";
const testDb = new PrismaClient({
    datasources: {
        db: {
            url: connectionString,
        },
    },
});

async function runDiagnostic() {
    try {
        console.log('🔄 Checking database connection...');
        await testDb.$queryRaw`SELECT 1`;
        console.log('✅ Database connection OK!');
    } catch (error: any) {
        console.error('❌ Connection error:', error);
    } finally {
        await testDb.$disconnect();
    }
}

runDiagnostic();