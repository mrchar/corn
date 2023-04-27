package net.mrchar.corn.repository;

import net.mrchar.corn.model.Quota;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.UUID;

@RepositoryRestResource(path = "quotas")
public interface QuotaRepository extends CrudRepository<Quota, Long> {
}
