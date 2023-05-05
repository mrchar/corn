package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Budget;
import net.mrchar.corn.model.Quota;
import net.mrchar.corn.model.Record;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.rest.core.config.Projection;

@Projection(name = "info", types = Record.class)
public interface RecordProjection {
    @Value("#{target.quota.budget}")
    Budget getBudget();

    Quota getQuota();

    Double getAmount();
}
