-- Etapas de entrega depois de "Concluído"; os projetos existentes não mudam.
ALTER TYPE "ProjectWorkflowStatus" ADD VALUE 'AWAITING_DELIVERY';
ALTER TYPE "ProjectWorkflowStatus" ADD VALUE 'DELIVERED';
