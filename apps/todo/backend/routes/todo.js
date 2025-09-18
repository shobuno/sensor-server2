// sensor-server/apps/todo/backend/routes/todo.js
const express = require('express');
const router = express.Router();

const widgets = require('./todo/widgets');
router.use('/widgets', widgets);
router.use('/holidays', require('./todo/holidays'));


const { attachItemRoutes }       = require('./todo/items');
const { attachActionRoutes }     = require('./todo/actions');
const { attachDayRoutes }        = require('./todo/day');
const { attachRepeatRuleRoutes } = require('./todo/repeat_rules');
const { attachReportRoutes }     = require('./todo/reports');

// 各モジュールにルート登録を委譲
attachItemRoutes(router);
attachActionRoutes(router);
attachDayRoutes(router);
attachRepeatRuleRoutes(router);
attachReportRoutes(router);

module.exports = router;
