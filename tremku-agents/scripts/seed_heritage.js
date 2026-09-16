const { main } = require('./seed_knowledge');

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
