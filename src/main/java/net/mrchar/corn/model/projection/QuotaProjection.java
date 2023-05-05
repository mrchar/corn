package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Action;
import net.mrchar.corn.model.Budget;
import net.mrchar.corn.model.Quota;
import net.mrchar.corn.model.base.AuditingProjection;
import org.springframework.data.rest.core.config.Projection;

@Projection(name = "info", types = Quota.class)
public interface QuotaProjection extends AuditingProjection {
    Budget getBudget();

    Action getAction();

    Double getAmount();
}
