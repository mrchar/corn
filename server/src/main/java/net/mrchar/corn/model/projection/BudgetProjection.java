package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Budget;
import net.mrchar.corn.model.Category;
import net.mrchar.corn.model.Space;
import net.mrchar.corn.model.base.AuditingProjection;
import net.mrchar.corn.model.element.Label;
import org.springframework.data.rest.core.config.Projection;

import java.util.Set;

@Projection(name = "info", types = Budget.class)
public interface BudgetProjection extends AuditingProjection {
    Category getCategory();

    Set<Label> getLabels();

    Space getSpace();

    Double getAmount();
}
