import { User } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                roleId: string;
                role?: {
                    name: string;
                };
            };

            _permissionCache?: Map<string, boolean>;
        }
    }
}
