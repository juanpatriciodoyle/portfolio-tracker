import { PrismaClient } from '@prisma/client';

// Force the connection string directly into the runtime variable pool
const connectionString = "postgresql://portfolio_user:portfolio_secure_password@localhost:5432/portfolio_tracker_db";
console.log('⚡ Attempting diagnostic connection to:', connectionString);

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
        // Attempt a basic low-level database query handshake
        await testDb.$queryRaw`SELECT 1`;
        console.log('✅ Connection authentication handshake succeeded!');

        const mockPayload = {
            ticker: "PRX.NL",
            unitPrice: 35.50,
            industry: "Technology",
            instrumentType: "Stock",
            regions: ["EU"],
            type: "BUY",
            cashAmount: 1000.0
        };

        console.log('\n🚀 Executing Asset creation test...');

        // This replicates the exact logic block we need to test
        const asset = await testDb.asset.create({
            data: {
                ticker: mockPayload.ticker,
                isin: `TEMP-${mockPayload.ticker}-${Date.now()}`,
                name: mockPayload.ticker,
                currentPrice: mockPayload.unitPrice,
                currency: 'EUR',
                industry: mockPayload.industry,
                regions: mockPayload.regions,
                allocations: {
                    create: {
                        instrumentType: mockPayload.instrumentType,
                        percentage: 100.0,
                    },
                },
            },
        });

        console.log('🎉 ASSET GENERATED SUCCESSFULLY:', asset);

    } catch (error: any) {
        console.error('\n❌ CRASH ANALYSIS CAUSE CAPTURED:');
        console.error(error);
    } finally {
        await testDb.$disconnect();
    }
}

runDiagnostic();