import { calculateDailyMetrics } from "../utils/analytics.service";
import { notifyByPermission } from "../utils/notification.service";

const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

calculateDailyMetrics(yesterday)
    .then(async (analytics) => {
        await notifyByPermission(
            "analytics",
            "visitor_summary",
            {
                visitor: analytics.visitor,
                uniqueVisitor: analytics.uniqueVisitor,
                bounceRate: analytics.bounceRate,
            },
            "analytics",
            analytics.id
        );

        console.log("✔ Daily analytics sent + updated");
    });
