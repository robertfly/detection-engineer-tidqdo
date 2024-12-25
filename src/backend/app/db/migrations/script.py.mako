# Alembic v1.12+ Migration Script Template
# SQLAlchemy v2.0+ Database Operations

"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    """Implements forward migration changes to upgrade database schema.
    
    Supports:
    - DDL operations for schema modifications
    - Data migrations when needed
    - Transaction management
    - Error handling and rollback
    - Migration logging
    """
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """Implements reverse migration changes to downgrade database schema.
    
    Supports:
    - Reverse DDL operations
    - Reverse data migrations when needed  
    - Transaction management
    - Error handling and rollback
    - Migration logging
    """
    ${downgrades if downgrades else "pass"}