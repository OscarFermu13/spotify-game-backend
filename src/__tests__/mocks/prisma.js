const prismaMock = {
    user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
    },
    game: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
    },
    gameSession: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
    },
    gameTrack: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
    },
    $transaction: jest.fn(),
};

// Resetear todos los mocks entre tests
beforeEach(() => {
    Object.values(prismaMock).forEach((model) => {
        if (typeof model === 'object') {
            Object.values(model).forEach((fn) => {
                if (typeof fn === 'function' && fn.mockReset) fn.mockReset();
            });
        }
    });
});

module.exports = prismaMock;