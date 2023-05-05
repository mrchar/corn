package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Action;
import net.mrchar.corn.model.Category;
import net.mrchar.corn.model.Recorder;
import net.mrchar.corn.model.Space;
import net.mrchar.corn.model.base.AuditingProjection;
import net.mrchar.corn.model.element.Label;
import org.springframework.data.rest.core.config.Projection;

import java.util.Set;

@Projection(name = "info", types = Recorder.class)
public interface RecorderProjection extends AuditingProjection {
    Category getCategory();

    Set<Label> getBudgetLabels();

    Space getSpace();

    Action getAction();

    Set<Label> getActionLabels();

    String getConfig();
}
