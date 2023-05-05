package net.mrchar.corn.repository;

import net.mrchar.corn.model.Quota;
import net.mrchar.corn.model.projection.QuotaProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "quotas", excerptProjection = QuotaProjection.class)
public interface QuotaRepository extends CrudRepository<Quota, Long> {
}
