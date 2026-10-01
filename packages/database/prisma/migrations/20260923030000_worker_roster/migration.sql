-- Funcionários deixam de ser Users (contas de login): viram um cadastro
-- próprio, sem nenhum campo obrigatório, usado só para atribuição de OS.
-- As atribuições existentes apontavam para Users; sob o novo modelo elas
-- perdem o sentido, então são removidas antes de trocar a referência.
DELETE FROM "QuoteWorkerAssignment";

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "cpf" TEXT,
    "phone" TEXT,
    "workColor" TEXT NOT NULL DEFAULT '#607453',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- DropForeignKey
ALTER TABLE "QuoteWorkerAssignment" DROP CONSTRAINT "QuoteWorkerAssignment_workerId_fkey";

-- AddForeignKey
ALTER TABLE "QuoteWorkerAssignment" ADD CONSTRAINT "QuoteWorkerAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "workColor";
